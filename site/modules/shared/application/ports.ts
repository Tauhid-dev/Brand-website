export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class CryptoUuidGenerator implements IdGenerator {
  next(): string {
    return crypto.randomUUID();
  }
}
