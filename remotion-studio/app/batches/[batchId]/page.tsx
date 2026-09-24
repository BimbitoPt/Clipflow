import BatchWorkspace from "@/components/BatchWorkspace";

export default function BatchPage({ params }: { params: { batchId: string } }) {
  return <BatchWorkspace batchId={params.batchId} />;
}
