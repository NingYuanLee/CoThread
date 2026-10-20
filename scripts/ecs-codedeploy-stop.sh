#!/usr/bin/env bash
# OOS 将停止与启动钩子拼接到同一个 shell，不能 exit 提前结束启动钩子。
# 不先停 cothread，由 ecs-promote 探活通过后再切换。
:
