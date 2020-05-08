cat gitignore-prod.sh > .gitignore
git add .
git commit -m "Deploying to heroku"
git push heroku master
