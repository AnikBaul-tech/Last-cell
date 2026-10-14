'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRoom } from '@/hooks/useRoom';
import { roomApi } from '@/lib/client/api';
import { clearSession } from '@/lib/client/session';
import Lobby from '@/components/Lobby';
import Game from '@/components/Game';
import JoinGate from '@/components/JoinGate';

function Message({ title, children }) {
  return (
    <main className="page narrow">
      <h1 className="logo small">{title}</h1>
      <p className="muted">{children}</p>
      <Link href="/" className="btn primary">Back to start</Link>
    </main>
  );
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code || '').toUpperCase();
  const r = useRoom(code);
  const { room, players, status, session, myPlayer, isHost } = r;

  const leave = async () => {
    if (room?.status === 'playing' && myPlayer?.is_alive && !window.confirm('Leave the game? You will be eliminated.')) return;
    try {
      if (session) await roomApi(code, 'leave', session);
    } catch {}
    clearSession(code);
    router.push('/');
  };

  if (status === 'noconfig')
    return <Message title="Setup needed">Supabase environment variables are missing. Copy .env.example to .env.local and fill it in.</Message>;
  if (status === 'notfound') return <Message title="Room not found">Check the code, or ask the host for a fresh invite link.</Message>;
  if (status === 'error') return <Message title="Can't reach the server">Check your connection and reload the page.</Message>;
  if (status === 'loading' || session === undefined || !room) return <main className="page narrow"><p className="muted">Loading…</p></main>;

  if (!session || !myPlayer) {
    return (
      <JoinGate
        code={code}
        room={room}
        players={players}
        onJoined={async (s) => {
          await r.refresh();
          r.setSession(s);
        }}
      />
    );
  }

  if (room.status === 'lobby') {
    return <Lobby code={code} room={room} players={players} myPlayer={myPlayer} isHost={isHost} session={session} onLeave={leave} />;
  }

  return (
    <Game
      code={code}
      room={room}
      players={players}
      me={r.me}
      myPlayer={myPlayer}
      isHost={isHost}
      session={session}
      serverNow={r.serverNow}
      onLeave={leave}
    />
  );
}
