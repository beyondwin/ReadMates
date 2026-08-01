import {
  MyReadingJourney,
  type MyReadingJourneyProps,
} from "./my-page/my-reading-journey";

export function MyRecordsPage(props: MyReadingJourneyProps) {
  return (
    <main className="rm-my-records-page">
      <header className="rm-my-records-page__header">
        <p className="rm-my-shelf-kicker desktop-only">내 공간</p>
        <h1>내 책별 기록</h1>
        <p>함께 읽은 책을 최근 기록부터 다시 살펴보세요.</p>
      </header>
      <MyReadingJourney {...props} heading="전체 기록" />
    </main>
  );
}
