import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PlaceholderSeccion({
  titulo,
  descripcion,
  fase,
}: {
  titulo: string;
  descripcion: string;
  fase: string;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground">
            En construcción
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{descripcion}</p>
          <p className="text-xs">Se implementa en: {fase}</p>
        </CardContent>
      </Card>
    </div>
  );
}
