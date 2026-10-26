declare module "@tanstack/react-start/api" {
  type HandlerArgs = { request: Request };
  type Handler = (args: HandlerArgs) => Response | Promise<Response>;
  type Methods = { GET?: Handler; POST?: Handler; PUT?: Handler; DELETE?: Handler; PATCH?: Handler };

  export function createAPIFileRoute(path: string): (methods: Methods) => Methods;
}
