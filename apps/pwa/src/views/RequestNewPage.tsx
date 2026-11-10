'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { set, startOfTomorrow } from 'date-fns';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { InlineError } from '@/components/ui/StateView';
import { CREATE_TITLE_LIMITS, DESCRIPTION_LIMITS, MARKET } from '@/config/index';
import { isFundedOffer, summarizeRequestFunding } from '@/features/requests/funding';
import { pickRequestPhotos, uploadRequestPhotos } from '@/features/requests/request-media';
import { useCreateRequest, useMyRequest, useUpdateRequest } from '@/features/requests/requester-api';
import { MAX_REQUEST_TAGS, useTagCatalogue, type RequestTag } from '@/features/requests/tags';
import { requestPosition, suggestAreaLabel, type Position } from '@/lib/geolocation';
import { showAppToast } from '@/lib/toast';
import { cn } from '@/lib/cn';
import { useUserId } from '@/features/auth/use-user-id';

export function RequestNewPage() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get('edit');
  const userId = useUserId();
  const create = useCreateRequest();
  const update = useUpdateRequest(editId ?? '');
  const existing = useMyRequest(editId ?? '');
  const tagsQuery = useTagCatalogue();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [areaLabel, setAreaLabel] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [selectedTags, setSelectedTags] = useState<RequestTag[]>([]);
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const funding = useMemo(() => {
    const parsed = Number(amount);
    if (!isFundedOffer(parsed)) return null;
    return summarizeRequestFunding(parsed);
  }, [amount]);

  const toggleTag = (tag: RequestTag) => {
    setSelectedTags((current) => {
      if (current.some((t) => t.id === tag.id)) {
        return current.filter((t) => t.id !== tag.id);
      }
      if (current.length >= MAX_REQUEST_TAGS) return current;
      return [...current, tag];
    });
  };

  const captureLocation = async () => {
    const result = await requestPosition({ fresh: true });
    if (!result.ok) {
      setError('Location is required to post.');
      return;
    }
    setPosition(result.position);
    const label = await suggestAreaLabel();
    if (label) setAreaLabel(label);
  };

  const addPhotos = async () => {
    if (!userId) return;
    const assets = await pickRequestPhotos(4);
    if (assets.length === 0) return;
    const paths = await uploadRequestPhotos(userId, assets);
    setAttachmentPath(paths[0] ?? null);
  };

  const submit = async () => {
    setError(null);
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < CREATE_TITLE_LIMITS.min || trimmedTitle.length > CREATE_TITLE_LIMITS.max) {
      setError(`Title must be ${CREATE_TITLE_LIMITS.min}–${CREATE_TITLE_LIMITS.max} characters.`);
      return;
    }
  if (description.length > DESCRIPTION_LIMITS.max) {
      setError('Description is too long.');
      return;
    }
    const offered = Number(amount);
    if (!isFundedOffer(offered)) {
      setError('Enter a valid offer amount.');
      return;
    }
    if (!position) {
      await captureLocation();
      setError('Add a location for this request.');
      return;
    }
    const label = areaLabel.trim() || 'Nearby';
    const scheduledFor = scheduledLocal ? new Date(scheduledLocal) : null;

    try {
      if (editId && existing.data) {
        await update.mutateAsync({
          title: trimmedTitle,
          description: description.trim(),
          position,
          locationLabel: label,
          scheduledFor,
          offeredAmount: offered,
          attachmentPath,
          tags: selectedTags,
        });
        router.push(`/request/${editId}`);
        return;
      }

      const requestId = await create.mutateAsync({
        title: trimmedTitle,
        description: description.trim(),
        position,
        locationLabel: label,
        scheduledFor,
        offeredAmount: offered,
        attachmentPath,
        tags: selectedTags,
      });
      showAppToast('Request posted.');
      router.push(`/request/${requestId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the request.');
    }
  };

  return (
    <FlowScreen
      title={editId ? 'Edit request' : 'New request'}
      backTo="/home"
      bodyClassName="flex flex-col gap-4 pb-10"
    >
      {error ? <InlineError message={error} /> : null}

      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextAreaField
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        hint={`Up to ${DESCRIPTION_LIMITS.max} characters`}
      />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-ink">Offer</p>
        <MoneyAmountInput accessibilityLabel="Offer amount" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d]/g, ''))} />
      </div>
      {funding ? (
        <p className="text-xs text-subtle">
          Helper receives {MARKET.currencySymbol}
          {funding.providerReceives.toLocaleString()} after the {Math.round(funding.serviceFee / funding.offerAmount * 100) || 10}%
          fee.
        </p>
      ) : null}

      <TextField
        label="Area label"
        value={areaLabel}
        onChange={(e) => setAreaLabel(e.target.value)}
        hint="Approximate area shown before acceptance"
      />
      <Button
        label={position ? 'Update location' : 'Use current location'}
        variant="secondary"
        onClick={() => void captureLocation()}
      />
      <TextField
        label="Schedule (optional)"
        type="datetime-local"
        value={scheduledLocal}
        onChange={(e) => setScheduledLocal(e.target.value)}
        hint={`Leave empty for today. Default tomorrow 9am: ${set(startOfTomorrow(), { hours: 9, minutes: 0 }).toISOString()}`}
      />

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Tags (up to {MAX_REQUEST_TAGS})</p>
        <div className="flex flex-wrap gap-2">
          {tagsQuery.data?.map((tag) => {
            const selected = selectedTags.some((t) => t.id === tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold active:opacity-90',
                  selected ? 'bg-active text-on-brand' : 'bg-surface text-ink',
                )}
                onClick={() => toggleTag(tag)}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      </section>

      <Button label="Add photo" variant="secondary" onClick={() => void addPhotos()} />
      {attachmentPath ? <p className="text-xs text-subtle">Photo attached</p> : null}

      <Button
        label={editId ? 'Save changes' : 'Post request'}
        loading={create.isPending || update.isPending}
        onClick={() => void submit()}
      />
    </FlowScreen>
  );
}
