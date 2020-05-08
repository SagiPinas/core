echo cat gitignore-prop.sh > .gitignore
git add .
git commit -m "Deploying to heroku"
git push heroku master
