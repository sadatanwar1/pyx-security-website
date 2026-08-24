FROM nginx:alpine

ENV PORT=8080

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY index.html portal.html cms-preview.html cms-preview.css cms-preview.js layout-refinements.css /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets

EXPOSE 8080
