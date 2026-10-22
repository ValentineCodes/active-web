import { View } from 'react-native';

import { RequestAttachmentSection } from '@/components/request-flow/RequestAttachmentSection';
import { RequestMetaRow } from '@/components/request-flow/RequestMetaRow';
import { RequestOfferWhenCard } from '@/components/request-flow/RequestOfferWhenCard';
import { RequestPersonCard } from '@/components/request-flow/RequestPersonCard';
import { RequestTagsLine } from '@/components/request-flow/RequestTagsLine';
import { RequestTitleSection } from '@/components/request-flow/RequestTitleSection';
import type { RespondableRequest } from '@/features/requests/responses-api';
import { nearbyRequestBadge } from '@/features/requests/status';
import {
  formatAgo,
  formatMoney,
  formatRequestOfferLocationLabel,
  formatWhenHome,
  formatWhenRequestCard,
} from '@/lib/format';

type RequestHelpSummaryProps = {
  request: RespondableRequest;
  existingResponse?: boolean;
  onRequesterPress?: () => void;
  onRequesterDiscussPress?: () => void;
  requesterDiscussLoading?: boolean;
};

/** Respond / pending-response detail — matches request_1 and request_0 mocks. */
export function RequestHelpSummary({
  request,
  existingResponse,
  onRequesterPress,
  onRequesterDiscussPress,
  requesterDiscussLoading,
}: RequestHelpSummaryProps) {
  const amount =
    request.offered_amount !== null ? formatMoney(request.offered_amount, request.currency) : null;

  const badge = nearbyRequestBadge(Boolean(existingResponse));

  return (
    <View className="gap-5">
      <RequestMetaRow
        badgeLabel={badge.label}
        badgeTone={badge.tone}
        trailing={formatAgo(request.posted_at)}
      />

      <RequestTitleSection title={request.title} description={request.description} />

      <RequestAttachmentSection attachmentPath={request.attachment_path} />

      {amount ? (
        <RequestOfferWhenCard
          amount={amount}
          whenLabel={formatWhenRequestCard(request.scheduled_for)}
          whenDetail={formatWhenHome(request.scheduled_for)}
          locationLabel={formatRequestOfferLocationLabel(
            request.location_label,
            request.distance_m,
          )}
        />
      ) : null}

      <RequestTagsLine slugs={request.tag_slugs} />

      {request.requester_display_name ? (
        <RequestPersonCard
          avatarPath={request.requester_avatar_path}
          name={request.requester_display_name}
          ratingAverage={request.requester_rating_average}
          ratingCount={request.requester_rating_count}
          completionPercent={request.requester_completion_percent}
          identityVerified={request.requester_identity_verified}
          onPress={onRequesterPress}
          onDiscussPress={onRequesterDiscussPress}
          discussLoading={requesterDiscussLoading}
        />
      ) : null}
    </View>
  );
}
