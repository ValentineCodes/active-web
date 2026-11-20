import { Redirect } from 'expo-router';

export default function ActivityResponsesRedirect() {
  return <Redirect href="/profile?tab=responses" />;
}