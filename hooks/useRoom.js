'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/client/supabase';
import { api, roomApi } from '@/lib/client/api';
import { clearSession, loadSession } from '@/lib/client/session';

/**
 * Live room state.
 *  - public data (room, players) is read straight from Supabase + realtime (cheap, no Vercel calls)
 *  - private data (my position / pending move) comes from /api/rooms/:code/me
 *  - any client pokes /tick when a deadline passes; the server only acts if it's really due
 */
export function useRoom(code) {
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | notfound | error | noconfig
  const [session, setSessionState] = useState(undefined); // undefined = not read yet, null = none
  const offsetRef = useRef(0);
  const refreshTimer = useRef(null);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);
  const noteServerTime = (now) => {
    if (typeof now === 'number') offsetRef.current = now - Date.now();
  };

  const setSession = useCallback((s) => setSessionState(s), []);
  const dropSession = useCallback(() => {
    clearSession(code);
    setSessionState(null);
    setMe(null);
  }, [code]);

  // read stored guest identity
  useEffect(() => {
    setSessionState(loadSession(code) || null);
  }, [code]);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return setStatus('noconfig');
    const [r, p] = await Promise.all([
      sb.from('rooms').select('*').eq('code', code).maybeSingle(),
      sb.from('players').select('*').eq('room_code', code).order('joined_at'),
    ]);
    if (r.error || p.error) return setStatus((s) => (s === 'ready' ? s : 'error'));
    if (!r.data) {
      setRoom(null);
      return setStatus('notfound');
    }
    setRoom(r.data);
    setPlayers(p.data || []);
    setStatus('ready');
  }, [code]);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 120);
  }, [refresh]);

  // initial load + realtime + slow fallback poll
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setStatus('noconfig');
      return;
    }
    refresh();
    const channel = sb
      .channel(`room-${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${code}` }, scheduleRefresh)
      .subscribe();
    const poll = setInterval(refresh, 4000);
    return () => {
      clearInterval(poll);
      clearTimeout(refreshTimer.current);
      sb.removeChannel(channel);
    };
  }, [code, refresh, scheduleRefresh]);

  const myPlayer = session ? players.find((p) => p.id === session.playerId) : null;
  const myAlive = myPlayer?.is_alive;

  // private state: refetch whenever the game moves on
  useEffect(() => {
    if (!session || !room) return;
    let cancelled = false;
    roomApi(code, 'me', session)
      .then((d) => {
        if (cancelled) return;
        noteServerTime(d.now);
        setMe(d);
      })
      .catch((e) => {
        if (e.status === 401 && !cancelled) dropSession();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, session, room?.round, room?.phase, room?.status, myAlive]);

  // forget the session if the server no longer lists me (left / room reset by deletion)
  useEffect(() => {
    if (session && status === 'ready' && players.length && !myPlayer) dropSession();
  }, [session, status, players, myPlayer, dropSession]);

  // phase ticker: whoever notices a passed deadline pokes the server (host first, others jittered)
  const isHost = Boolean(room && session && room.host_id === session.playerId);
  useEffect(() => {
    if (!room || room.status !== 'playing') return;
    let inflight = false;
    let lastCall = 0;
    const jitter = isHost ? 0 : 400 + Math.floor(Math.random() * 1200);
    const id = setInterval(() => {
      const now = Date.now() + offsetRef.current;
      const due =
        room.phase === 'resolving'
          ? now - Date.parse(room.updated_at) > 11000
          : room.phase_ends_at && now >= Date.parse(room.phase_ends_at) + jitter;
      if (!due || inflight || Date.now() - lastCall < 1500) return;
      inflight = true;
      lastCall = Date.now();
      api(`/api/rooms/${code}/tick`)
        .then((d) => noteServerTime(d.now))
        .catch(() => {})
        .finally(() => {
          inflight = false;
          scheduleRefresh();
        });
    }, 400);
    return () => clearInterval(id);
  }, [code, room?.round, room?.phase, room?.status, room?.phase_ends_at, room?.updated_at, isHost, scheduleRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  return { room, players, me, status, session, setSession, dropSession, myPlayer, isHost, serverNow, refresh };
}
