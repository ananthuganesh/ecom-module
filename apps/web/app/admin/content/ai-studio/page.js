"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
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

export default function AdminAiStudioPage() {
  return (
    <main className="min-h-screen pb-8">
      <div className="mb-4">
        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
          AI Studio
        </h1>
        <p className="mt-0.5 text-[0.8125rem] font-[450] leading-5 text-[#616161]">
          Generate product visuals and creative assets
        </p>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Coming soon</CardTitle>
          <CardDescription>
            AI image tools for product shoots and creative variants are on the way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="border-0 p-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Sparkles />
              </EmptyMedia>
              <EmptyTitle>AI Studio is coming soon</EmptyTitle>
              <EmptyDescription>
                Check back later — product media tools will live here.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                size="lg"
                className="h-8"
                nativeButton={false}
                render={<Link href="/admin/content" />}
              >
                Go to Content
              </Button>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </main>
  );
}
