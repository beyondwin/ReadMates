function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function defaultSessionDateFrom(currentDate: Date) {
  return `${currentDate.getFullYear()}-${padDatePart(currentDate.getMonth() + 1)}-${padDatePart(currentDate.getDate())}`;
}
