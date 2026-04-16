CREATE TABLE "canvases" (
	"id" text PRIMARY KEY NOT NULL,
	"wall_id" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"palette_version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walls" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"photo_url" text,
	"approx_heading" integer,
	"visibility_radius_m" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
