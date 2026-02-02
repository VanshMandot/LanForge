import { randomUUID } from "crypto";

export function createUniqueId(prefix: string = ""): string {
    return `${prefix}${randomUUID()}`;
}
