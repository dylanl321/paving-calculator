// Minimal D1 type definitions for Cloudflare Workers

export interface D1Database {
	prepare(query: string): D1PreparedStatement;
	dump(): Promise<ArrayBuffer>;
	batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
	exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	first<T = unknown>(colName?: string): Promise<T | null>;
	run<T = unknown>(): Promise<D1Result<T>>;
	all<T = unknown>(): Promise<D1Result<T>>;
	raw<T = unknown>(): Promise<T[]>;
}

export interface D1Result<T = unknown> {
	results: T[];
	success: boolean;
	meta: {
		duration: number;
		size_after: number;
		rows_read: number;
		rows_written: number;
	};
}

export interface D1ExecResult {
	count: number;
	duration: number;
}

// Minimal R2 type definitions for Cloudflare Workers
export interface R2Bucket {
	put(
		key: string,
		value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob,
		options?: R2PutOptions
	): Promise<R2Object>;
	get(key: string): Promise<R2ObjectBody | null>;
	head(key: string): Promise<R2Object | null>;
	delete(key: string | string[]): Promise<void>;
}

export interface R2PutOptions {
	httpMetadata?: { contentType?: string; cacheControl?: string };
	customMetadata?: Record<string, string>;
}

export interface R2Object {
	key: string;
	size: number;
	etag: string;
	httpEtag: string;
	uploaded: Date;
	httpMetadata?: { contentType?: string; cacheControl?: string };
	customMetadata?: Record<string, string>;
}

export interface R2ObjectBody extends R2Object {
	body: ReadableStream;
	bodyUsed: boolean;
	arrayBuffer(): Promise<ArrayBuffer>;
	text(): Promise<string>;
	blob(): Promise<Blob>;
}
