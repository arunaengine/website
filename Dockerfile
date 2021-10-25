FROM node:latest as build
WORKDIR /usr/local/app
COPY ./ /usr/local/app/
RUN npm install
RUN npm run build
RUN rm -r /usr/local/app/dist/BioDataDBWebsite/assets/config/config.json

FROM nginx:alpine
RUN apk update
RUN apk upgrade
COPY config/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /usr/local/app/dist/BioDataDBWebsite /usr/share/nginx/html
EXPOSE 80