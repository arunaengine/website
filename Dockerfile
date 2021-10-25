FROM node:latest as build
WORKDIR /usr/local/app
COPY ./ /usr/local/app/
RUN npm install
RUN npm run build
RUN rm -r /usr/local/app/dist/BioDataDBWebsite/assets/config/config.yaml

FROM nginx:latest
COPY --from=build /usr/local/app/dist/BioDataDBWebsite /usr/share/nginx/html
EXPOSE 80