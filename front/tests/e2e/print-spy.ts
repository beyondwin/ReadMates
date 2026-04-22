import type { Page } from "@playwright/test";

function installPrintSpyOnWindow(): void {
  type PrintSpyWindow = Window & { __readmatesPrintCalls?: number };

  const printWindow = window as PrintSpyWindow;
  printWindow.__readmatesPrintCalls = 0;
  printWindow.print = () => {
    printWindow.__readmatesPrintCalls =
      (printWindow.__readmatesPrintCalls ?? 0) + 1;
  };
}

export async function installPrintSpy(page: Page): Promise<void> {
  await page.addInitScript(installPrintSpyOnWindow);
  await page.evaluate(installPrintSpyOnWindow);
}

export async function readPrintCallCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    type PrintSpyWindow = Window & { __readmatesPrintCalls?: number };

    return (window as PrintSpyWindow).__readmatesPrintCalls ?? 0;
  });
}
