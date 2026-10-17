export type ReportIssueOption = {
  id: string;
  label: string;
};

export const SOMETHING_ELSE_ISSUE_ID = 'something_else';

export const REQUEST_REPORT_ISSUES: ReportIssueOption[] = [
  { id: 'no_show', label: "They didn't show up" },
  { id: 'unreachable', label: "Can't reach them" },
  { id: 'work_not_agreed', label: 'Work not done as agreed' },
  { id: 'payment', label: 'Payment or pricing concern' },
  { id: 'safety', label: 'Safety concern' },
  { id: SOMETHING_ELSE_ISSUE_ID, label: 'Something else' },
];

export const APP_REPORT_ISSUES: ReportIssueOption[] = [
  { id: 'bug', label: "Something isn't working" },
  { id: 'account', label: 'Account or profile issue' },
  { id: 'payments', label: 'Payments or wallet issue' },
  { id: SOMETHING_ELSE_ISSUE_ID, label: 'Something else' },
];
