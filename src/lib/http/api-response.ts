import { NextResponse } from "next/server";

type ApiMeta = {
  requestId: string;
};

export function apiSuccess<T>(data: T, status = 200) {
  const meta: ApiMeta = { requestId: crypto.randomUUID() };
  return NextResponse.json({ data, meta }, { status });
}

export function apiError(
  code: string,
  message: string,
  status: number,
  fields?: Record<string, string>,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        fields,
        requestId: crypto.randomUUID(),
      },
    },
    { status },
  );
}
