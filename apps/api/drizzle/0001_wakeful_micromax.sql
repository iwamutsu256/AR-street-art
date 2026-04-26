CREATE TABLE "palettes" (
	"version" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"colors" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "palettes" ("version", "name", "colors")
VALUES (
	'v1',
	'default',
	'["#fff8f0","#f2e8dc","#c7b8a3","#8f7e67","#4b4037","#13100d","#ffb3c1","#ff7a93","#d94a65","#8f213c","#ff9f68","#f97316","#c2410c","#7c2d12","#ffd166","#facc15","#ca8a04","#713f12","#d9f99d","#84cc16","#4d7c0f","#365314","#86efac","#22c55e","#15803d","#14532d","#7dd3fc","#38bdf8","#2563eb","#1d4ed8","#c4b5fd","#8b5cf6"]'::jsonb
)
ON CONFLICT ("version") DO NOTHING;
