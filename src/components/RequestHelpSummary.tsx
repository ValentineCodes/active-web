import { View } from 'react-native';

import { RequestAttachmentSection } from '@/components/request-flow/RequestAttachmentSection';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestOfferWhenCard } from '@/components/request-flow/RequestOfferWhenCard';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import type { RespondableRequest } from '@/features/requests/responses-api';
import { nearbyRequestBadge } from '@/features/requests/status';
import {
  formatAgo,
  formatMoney,
  formatProximityHome,
  formatWhenHome,
  formatWhenRequestCard,
} from '@/lib/format';

type RequestHelpSummaryProps = {
  request: RespondableRequest;
  postedAt?: string | null;
  existingResponse?: boolean;
  onRequesterPress?: () => void;
};

/** Respond / pending-response detail — matches request_1 and request_0 mocks. */
export function RequestHelpSummary({
  request,
  postedAt,
  existingResponse,
  onRequesterPress,
}: RequestHelpSummaryProps) {
  const amount =
    request.offered_amount !== null ? formatMoney(request.offered_amount, request.currency) : null;

  const badge = existingResponse
    ? { label: 'Open', tone: 'warning' as const }
    : nearbyRequestBadge(false);

  return (
    <View className="gap-5">
      {postedAt ? (
        <RequestMetaRow
          badgeLabel={badge.label}
          badgeTone={badge.tone}
          trailing={formatAgo(postedAt)}
        />
      ) : (
        <RequestMetaRow badgeLabel={badge.label} badgeTone={badge.tone} trailing="Open" />
      )}

      <RequestTitleSection title={request.title} description={request.description} />

      <RequestAttachmentSection attachmentPath={request.attachment_path} />

      {amount ? (
        <RequestOfferWhenCard
          amount={amount}
          whenLabel={formatWhenRequestCard(request.scheduled_for)}
          whenDetail={formatWhenHome(request.scheduled_for)}
          locationLabel={formatProximityHome(request.distance_m)}
        />
      ) : null}

      {request.requester_display_name ? (
        <RequestPersonCard
          avatarPath={request.requester_avatar_path}
          name={request.requester_display_name}
          ratingAverage={request.requester_rating_average}
          ratingCount={request.requester_rating_count}
          completionPercent={request.requester_completion_percent}
          onPress={onRequesterPress}
        />
      ) : null}
    </View>
  );
}
