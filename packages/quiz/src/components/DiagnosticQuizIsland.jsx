import { PostHogProvider, AnalyticsProvider } from '@hospital-capilar/shared/analytics';
import DiagnosticQuiz from './DiagnosticQuiz';

export default function DiagnosticQuizIsland({ nicho }) {
  return (
    <PostHogProvider>
      <AnalyticsProvider>
        <DiagnosticQuiz nicho={nicho} />
      </AnalyticsProvider>
    </PostHogProvider>
  );
}
