import { Redirect } from 'expo-router';

/** Activity lives in the Profile hub — preserve deep links. */
export default function ActivityRequestsRedirect() {
  return <Redirect href="/profile?tab=requests" />;
}