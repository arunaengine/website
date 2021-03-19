FROM alpine:latest as certs
RUN apk --update add ca-certificates

FROM golang:latest as builder

RUN mkdir /ETLWebsite
WORKDIR /ETLWebsite
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -ldflags '-extldflags "-static"' -o ETLWebsite .

FROM scratch
COPY --from=certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /ETLWebsite/ETLWebsite .

COPY static /static
COPY templates /templates

ENTRYPOINT [ "/ETLWebsite", "-c", "/config/config.yaml" ]