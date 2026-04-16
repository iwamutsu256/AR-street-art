CREATE TABLE "canvases" (
	"id" text PRIMARY KEY NOT NULL,
	"wall_id" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"palette_version" text DEFAULT 'v1' NOT NULL,
	"pixel_data" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walls" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"original_image_url" text,
	"thumbnail_image_url" text,
	"rectified_image_url" text,
	"corner_coordinates" jsonb NOT NULL,
	"approx_heading" integer,
	"visibility_radius_m" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_wall_id_walls_id_fk" FOREIGN KEY ("wall_id") REFERENCES "public"."walls"("id") ON DELETE cascade ON UPDATE no action;