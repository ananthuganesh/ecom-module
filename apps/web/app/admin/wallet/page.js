"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function AdminWalletPage() {
  return (
    <main className="min-h-screen pb-8">
      <div className="mb-4">
        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
          Wallet / Refunds
        </h1>
        <p className="mt-0.5 text-[0.8125rem] font-[450] leading-5 text-[#616161]">
          View wallets and issue refunds
        </p>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Coming soon</CardTitle>
          <CardDescription>
            Wallet and refund management tools are on the way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="border-0 p-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Wallet />
              </EmptyMedia>
              <EmptyTitle>Wallet / Refunds is coming soon</EmptyTitle>
              <EmptyDescription>
                Check back later — store credit and refunds will live here.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                size="lg"
                className="h-8"
                nativeButton={false}
                render={<Link href="/admin/customers" />}
              >
                Go to Customers
              </Button>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </main>
  );
}
