"use client";

import { useState } from "react";
import { BusinessReportView } from "@/components/business-report";
import { Segmented } from "@/components/kit";
import { ReportsView } from "@/components/reports-view";
import { t } from "@/lib/i18n";

export default function ReportsPage() {
  const [view, setView] = useState<"dates" | "tasks">("dates");
  return (
    <>
      <Segmented
        id="reports-kind"
        className="no-print mb-5"
        value={view}
        onChange={setView}
        options={[
          { value: "dates", label: t("Reports by date") },
          { value: "tasks", label: t("Task reports and daily submissions") },
        ]}
      />
      {view === "dates" ? <BusinessReportView /> : <ReportsView />}
    </>
  );
}
