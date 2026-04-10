#!/bin/sh
# Clear out the bucket recordings
aws s3 rm s3://wxstream-recordings --recursive
