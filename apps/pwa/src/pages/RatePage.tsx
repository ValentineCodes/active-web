import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/TextField';
import { useRateRequest } from '@/features/requests/requester-api';
import { showAppToast } from '@/lib/toast';

export function RatePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const rate = useRateRequest(id);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');

  const submit = async () => {
    await rate.mutateAsync({ stars, comment: comment.trim() || null });
    showAppToast('Thanks for your rating.');
    navigate(`/engagement/${id}`);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 py-2">
      <header className="flex items-center gap-2">
        <Link to={`/engagement/${id}`} className="text-sm font-semibold text-brand">
          Back
        </Link>
        <h1 className="text-lg font-semibold text-ink">Rate</h1>
      </header>

      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            className={`h-12 w-12 rounded-full text-lg font-semibold ${value <= stars ? 'bg-brand text-on-brand' : 'bg-surface text-subtle'}`}
            onClick={() => setStars(value)}
          >
            {value}
          </button>
        ))}
      </div>

      <TextAreaField label="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button label="Submit rating" loading={rate.isPending} onClick={() => void submit()} />
    </div>
  );
}
