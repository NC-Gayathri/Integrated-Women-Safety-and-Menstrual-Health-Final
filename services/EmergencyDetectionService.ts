export class EmergencyDetectionService {
  private static readonly EMERGENCY_KEYWORDS_AND_PHRASES = [
    'suicide',
    'self harm',
    'self-harm',
    'rape',
    'assault',
    'bleeding heavily',
    'bleeding a lot',
    'unconscious',
    'overdose',
    'emergency',
    'fainting',
    'severe chest pain',
    'stalking',
    'domestic violence',
    'someone is following me',
    'i think i am being watched',
    "i think i'm being watched",
    'i feel unsafe',
    'took too many pills',
    'partner keeps hurting me',
    'kill myself',
    'end my life'
  ];

  static detectEmergency(message: string): boolean {
    const normalizedMessage = message.toLowerCase();
    for (const phrase of this.EMERGENCY_KEYWORDS_AND_PHRASES) {
      if (normalizedMessage.includes(phrase)) {
        return true;
      }
    }
    return false;
  }

  static getEmergencyResourceMessage(): string {
    return `**If you are in immediate danger, contact your local emergency services or trusted contacts immediately.**\n\n**You can also use the SOS feature available in this app.**`;
  }
}
