/// <reference types="node" />
import { EventEmitter } from 'events';
import { WrapOptions } from 'retry';
import * as pg from 'pg';
export declare type DsnOrClientConfig = string | pg.ClientConfig;
export declare type PgSubscriberConfig = {
    channels?: string[];
    pgConnectionConfig: DsnOrClientConfig;
    dbConnectRetryOptions?: WrapOptions;
};
export declare class PgSubscriber extends EventEmitter {
    channels: string[];
    dbConnectRetryOptions: WrapOptions | undefined;
    pgConnectionConfig: DsnOrClientConfig;
    _db: pg.Client | null;
    isOpen: boolean;
    constructor(config: PgSubscriberConfig);
    addChannel(channel: string, callback?: (...args: any[]) => any): Promise<void>;
    db(): Promise<pg.Client>;
    _processNotification(msg: any): void;
    removeChannel(channel: string, callback?: (...args: any[]) => void): Promise<void>;
    publish(channel: string, data: any): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map