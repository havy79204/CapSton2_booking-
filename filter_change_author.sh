#!/bin/sh

git filter-branch --env-filter '
if [ "$GIT_COMMITTER_NAME" = "Your Name" ]; then
  GIT_COMMITTER_NAME="hoangvu19"
  GIT_COMMITTER_EMAIL="vupham.190504@gmail.com"
fi
if [ "$GIT_AUTHOR_NAME" = "Your Name" ]; then
  GIT_AUTHOR_NAME="hoangvu19"
  GIT_AUTHOR_EMAIL="vupham.190504@gmail.com"
fi
export GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL
' -- --all
