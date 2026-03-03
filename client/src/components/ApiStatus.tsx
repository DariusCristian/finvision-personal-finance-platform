import { useEffect, useState } from 'react';

import { checkApiHealth } from '../lib/api';

export function ApiStatus() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'unreachable'>('loading');

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      const health = await checkApiHealth();
      if (mounted) {
        setStatus(health);
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <p className="text-sm text-slate-600">
      API status:{' '}
      <span className="font-semibold text-slate-800">
        {status === 'loading' ? 'checking...' : status === 'ok' ? 'ok' : 'unreachable'}
      </span>
    </p>
  );
}
