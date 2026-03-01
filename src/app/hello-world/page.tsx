import type { Metadata } from "next";
import HelloWorld from "@/modules/test-for-n8n/components/HelloWorld";

export const metadata: Metadata = {
  title: "Hello World - QA Suite Test",
  description: "Hello World test page for the test-for-n8n module of the QA Suite.",
};

export default function HelloWorldPage() {
  return <HelloWorld />;
}
