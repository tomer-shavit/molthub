import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categoryColors, getChannelIcon } from "./template-constants";
import type { Template } from "@/lib/api";

interface TemplateCardProps {
  template: Template;
  onUseTemplate?: (id: string) => void;
}

export function TemplateCard({ template, onUseTemplate }: TemplateCardProps) {
  const categoryColor = categoryColors[template.category.toLowerCase()] ?? categoryColors.minimal;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{template.name}</CardTitle>
          {template.isBuiltin && (
            <Badge variant="secondary" className="shrink-0">Builtin</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant="outline" className={categoryColor}>
            {template.category}
          </Badge>
          {template.channels?.map((ch) => {
            const Icon = getChannelIcon(ch.type);
            return (
              <Badge key={ch.type} variant="outline" className="gap-1">
                <Icon className="h-3 w-3" />
                {ch.type}
              </Badge>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {template.description}
        </p>

        <div className="flex items-center gap-2">
          {onUseTemplate ? (
            <Button size="sm" onClick={() => onUseTemplate(template.id)}>
              Use Template
            </Button>
          ) : (
            <Link href={`/bots/new?templateId=${template.id}`}>
              <Button size="sm">Use Template</Button>
            </Link>
          )}
          <Link href={`/templates/${template.id}`}>
            <Button variant="ghost" size="sm">View Details</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
