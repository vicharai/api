import { z } from "zod";

/** `system_setting` row holding the admin model error-rate alert rules. */
export const MODEL_ERROR_RATE_ALERTS_SETTING_ID = "model_error_rate_alerts";

function isHttpsUrl(value: string): boolean {
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

export const modelErrorRateAlertWebhookUrlSchema = z
	.string()
	.trim()
	.max(2048)
	.refine(isHttpsUrl, "Webhook URL must be an https URL");

export const modelErrorRateAlertRulesSchema = z.object({
	enabled: z.boolean(),
	thresholdPercent: z.number().min(1).max(100),
	minRequests: z.number().int().min(1),
	windowMinutes: z.number().int().min(5).max(1440),
	cooldownMinutes: z.number().int().min(5).max(10080),
});

export const modelErrorRateAlertSettingsSchema =
	modelErrorRateAlertRulesSchema.extend({
		webhookUrl: modelErrorRateAlertWebhookUrlSchema.nullable(),
	});

export type ModelErrorRateAlertSettings = z.infer<
	typeof modelErrorRateAlertSettingsSchema
>;

export const DEFAULT_MODEL_ERROR_RATE_ALERT_SETTINGS: ModelErrorRateAlertSettings =
	{
		enabled: false,
		thresholdPercent: 20,
		minRequests: 50,
		windowMinutes: 15,
		cooldownMinutes: 60,
		webhookUrl: null,
	};

/** Parse the stored JSON value; missing or invalid input yields the defaults. */
export function parseModelErrorRateAlertSettings(
	value: string | null | undefined,
): ModelErrorRateAlertSettings {
	if (!value) {
		return DEFAULT_MODEL_ERROR_RATE_ALERT_SETTINGS;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return DEFAULT_MODEL_ERROR_RATE_ALERT_SETTINGS;
	}
	const result = modelErrorRateAlertSettingsSchema.safeParse(parsed);
	return result.success ? result.data : DEFAULT_MODEL_ERROR_RATE_ALERT_SETTINGS;
}
