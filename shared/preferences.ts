import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * User-facing options for the opencode-usage plugin.
 *
 * The refresh interval governs the live sidebar row only. The Usage page keeps
 * Paseo's own five-minute report cache.
 */
export const preferences = defineSettings({
  id: "preferences",
  scope: "host",
  version: 1,
  schema: z.object({
    /** How often the live row asks for fresh numbers, in seconds. */
    refreshSeconds: z
      .union([z.literal(15), z.literal(30), z.literal(60), z.literal(180), z.literal(300)])
      .default(180),
    /** Show the live row in the sidebar footer. */
    showInFooter: z.boolean().default(true),
    /**
     * How much the sidebar row shows. The detailed row gives every provider
     * its own line with every window; the compact row keeps one number per
     * provider on one line.
     */
    layout: z.enum(["detailed", "compact"]).default("detailed"),
  }),
});

export type Preferences = z.output<typeof preferences.schema>;

export const DEFAULT_PREFERENCES: Preferences = preferences.schema.parse({});
