'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/TextField';
import { cn } from '@/lib/cn';
import { useRateRequest } from '@/features/requests/requester-api';
import { useRouteParam } from '@/lib/route-param';
import { showAppToast } from '@/lib/toast';

export function RatePage() {
  const id = useRouteParam('id');
  const router = useRouter();
  const rate = useRateRequest(id);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');

  const submit = async () => {
    await rate.mutateAsync({ stars, comment: comment.trim() || null });
    showAppToast('Thanks for your rating.');
    router.push(`/engagement/${id}`);
  };

  return (
    <FlowScreen title="Rate" backTo={`/engagement/${id}`} bodyClassName="flex flex-col gap-6">
      <div className="flex flex-row gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`${value} stars`}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold active:opacity-80',
              value <= stars ? 'bg-active text-on-brand' : 'bg-surface text-subtle',
            )}
            onClick={() => setStars(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <TextAreaField label="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button label="Submit rating" loading={rate.isPending} onClick={() => void submit()} />
    </FlowScreen>
  );
}
