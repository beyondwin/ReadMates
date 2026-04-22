function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function thirdWednesdayOfMonth(year: number, monthIndex: number) {
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const daysUntilWednesday = (3 - firstDayOfMonth.getDay() + 7) % 7;

  return new Date(year, monthIndex, 1 + daysUntilWednesday + 14);
}

export function defaultSessionDateFrom(currentDate: Date) {
  const year = currentDate.getFullYear();
  const monthIndex = currentDate.getMonth();
  const day = currentDate.getDate();
  const thisMonthThirdWednesday = thirdWednesdayOfMonth(year, monthIndex);
  const defaultDate =
    day <= thisMonthThirdWednesday.getDate()
      ? thisMonthThirdWednesday
      : thirdWednesdayOfMonth(year, monthIndex + 1);

  return `${defaultDate.getFullYear()}-${padDatePart(defaultDate.getMonth() + 1)}-${padDatePart(defaultDate.getDate())}`;
}
