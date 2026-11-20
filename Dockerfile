# One app image: the React app is built into .NET's wwwroot, so the API and the UI share an
# origin. See docs/spec.md, sections 1 and 13.

FROM node:24-slim AS web
WORKDIR /web
COPY src/web/package.json src/web/package-lock.json ./
RUN npm ci
COPY src/web/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server
WORKDIR /src
COPY src/server/CardCreator.Server/CardCreator.Server.csproj CardCreator.Server/
RUN dotnet restore CardCreator.Server/CardCreator.Server.csproj
COPY src/server/CardCreator.Server/ CardCreator.Server/
RUN dotnet publish CardCreator.Server/CardCreator.Server.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
# Pre-created and owned by the app user, so a fresh named volume mounted here inherits that
# ownership and the non-root app can write Artwork into it.
RUN mkdir -p /data/artwork && chown "$APP_UID" /data/artwork
COPY --from=server /app ./
COPY --from=web /web/dist ./wwwroot
# The asset library (Frames, fonts, Snippet backgrounds, emoji), scanned at startup.
COPY assets/ ./assets/
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "CardCreator.Server.dll"]
