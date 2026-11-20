type ProjectAssignmentsVisibility = {
  viewer_is_creator: boolean;
  viewer_is_contributor?: boolean | null;
  viewer_may_view_assignments?: boolean | null;
};

/** Creator and pool contributors may view the assignments list — not the Respond CTA. */
export function projectViewerMayViewAssignments(detail: ProjectAssignmentsVisibility): boolean {
  if (detail.viewer_may_view_assignments != null) {
    return detail.viewer_may_view_assignments;
  }
  return detail.viewer_is_creator || detail.viewer_is_contributor === true;
}