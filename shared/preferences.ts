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
    refreshSeconds: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(300)]).default(30),
    /** Show the live row in the sidebar footer. */
    showInFooter: z.boolean().default(true),
  }),
});

export type Preferences = z.output<typeof preferences.schema>;

export const DEFAULT_PREFERENCES: Preferences = preferences.schema.parse({});
