"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";

export function ErpPage({ title, subtitle, actions, children }) {
  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 text-[0.8125rem] font-[450] leading-5 text-[#616161]">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-1.5">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function ErpTable({ headers, rows, empty }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead
                key={h}
                className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground"
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows}
          {!rows?.length ? (
            <TableRow>
              <TableCell
                colSpan={headers.length}
                className="px-4 py-12 text-center text-[13px] text-muted-foreground"
              >
                {empty || "No records"}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </Card>
  );
}

export { Button as ErpButton, Input as ErpInput };
