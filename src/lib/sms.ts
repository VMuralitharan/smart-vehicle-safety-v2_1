export type SmsEventType='accident'|'drowsiness'|'emergencyButton';
import type {SmsModeConfig} from './types';

export const DEFAULT_SMS_MODE_CONFIG:SmsModeConfig={
 mode:'test',normalEnabledAt:0,notifyAccident:false,notifyDrowsiness:false,
 notifyEmergencyButton:false,revision:0,
};

export const SMS_TEMPLATE_MAX_LENGTH=240;
export const DEFAULT_SMS_TEMPLATES:Record<SmsEventType,string>={
 accident:'Smart Vehicle Safety Alert\nPossible accident detected.\nVehicle: {plateNumber}\nImpact: {impactG}g\nLocation: {locationUrl}',
 drowsiness:'Smart Vehicle Safety Alert\nDriver drowsiness detected.\nVehicle: {plateNumber}\nPlease contact the driver.\nLocation: {locationUrl}',
 emergencyButton:'Smart Vehicle Safety Alert\nMobile emergency request submitted.\nVehicle: {plateNumber}\nImmediate assistance may be required.\nLocation: {locationUrl}',
};
export const SMS_EVENT_LABELS:Record<SmsEventType,string>={
 accident:'Accident Detection SMS',drowsiness:'Driver Drowsiness SMS',emergencyButton:'Mobile Emergency SMS',
};
const PLACEHOLDERS=['vehicleName','plateNumber','eventType','eventTime','impactG','locationUrl'] as const;
export type SmsRenderData=Record<(typeof PLACEHOLDERS)[number],string>;

export function validateSmsTemplate(template:string){
 const value=template.trim();
 if(!value)return 'Message cannot be empty.';
 if(value.length>SMS_TEMPLATE_MAX_LENGTH)return `Keep the template at ${SMS_TEMPLATE_MAX_LENGTH} characters or fewer.`;
 if(/[^\x09\x0A\x0D\x20-\x7E]/.test(value))return 'Use plain SMS text without emojis or special Unicode characters.';
 const tokens=value.match(/\{[^{}]*\}/g)||[];
 for(const token of tokens){if(!PLACEHOLDERS.includes(token.slice(1,-1) as any))return `Unsupported placeholder: ${token}`;}
 const withoutTokens=value.replace(/\{[^{}]*\}/g,'');
 if(/[{}]/.test(withoutTokens))return 'Check unmatched placeholder braces.';
 return '';
}
export function renderSmsTemplate(template:string,data:SmsRenderData){
 let result=template;
 for(const key of PLACEHOLDERS)result=result.split(`{${key}}`).join(data[key]||'Unavailable');
 return result;
}
export function normalizeSmsPhone(value:string){
 const compact=value.trim().replace(/[\s().-]/g,'');
 if(/^0\d{9}$/.test(compact))return `+94${compact.slice(1)}`;
 if(/^94\d{9}$/.test(compact))return `+${compact}`;
 if(/^\+94\d{9}$/.test(compact))return compact;
 return null;
}
