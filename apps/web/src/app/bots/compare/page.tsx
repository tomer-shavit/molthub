import { Suspense } from "react";
import ComparePageContent from "./compare-content";

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          Loading comparison data...
        </div>
      }
    >
      <ComparePageContent />
    </Suspense>
  );
}
