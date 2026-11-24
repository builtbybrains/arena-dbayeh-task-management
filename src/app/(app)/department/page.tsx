"use client";

import { DepartmentView } from "@/components/department";
import { Empty } from "@/components/kit";
import { t } from "@/lib/i18n";
import { useMe } from "@/lib/store";

export default function MyDepartmentPage() {
  const me = useMe();
  if (!me.department_id) return <Empty title={t("No department")} hint={t("This profile is not attached to a department.")} />;
  return <DepartmentView deptId={me.department_id} wide />;
}
