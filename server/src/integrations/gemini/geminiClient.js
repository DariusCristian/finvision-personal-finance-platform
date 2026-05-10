import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({});

export async function generateFinnyReply({ message, systemInstruction, context }) {
  const serializedContext = JSON.stringify(context ?? {}, null, 2);
  const prompt = [
    'User message:',
    message,
    '',
    'Context JSON:',
    serializedContext,
  ].join('\n');

  const requestPayload = {
    model: 'gemini-2.5-flash',
    contents: prompt,
  };

  const config = {
    responseMimeType: 'application/json',
  };

  if (typeof systemInstruction === 'string' && systemInstruction.trim().length > 0) {
    config.systemInstruction = systemInstruction;
  }

  requestPayload.config = config;

  const res = await ai.models.generateContent(requestPayload);
  return res.text || '';
}
