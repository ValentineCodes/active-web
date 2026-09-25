export const queryKeys = {
  profile: ['profile'] as const,
  categories: ['categories'] as const,
  availability: ['availability'] as const,
  myRequests: ['my-requests'] as const,
  myRequest: (requestId: string) => ['my-requests', requestId] as const,
  requestResponses: (requestId: string) => ['request-responses', requestId] as const,
  nearbyRequests: ['nearby-requests'] as const,
  browseNearbyAll: ['browse-nearby'] as const,
  browseNearby: (latitude: number | null, longitude: number | null) =>
    ['browse-nearby', latitude, longitude] as const,
  browseRequest: (requestId: string, latitude: number | null, longitude: number | null) =>
    ['browse-request', requestId, latitude, longitude] as const,
  myResponses: ['my-responses'] as const,
  engagement: (requestId: string) => ['engagement', requestId] as const,
  avatarUrl: (path: string) => ['avatar-url', path] as const,
  catalogue: (userId: string) => ['catalogue', userId] as const,
  catalogueMediaUrl: (path: string) => ['catalogue-media-url', path] as const,
};
