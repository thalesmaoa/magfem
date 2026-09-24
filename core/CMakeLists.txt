cmake_minimum_required(VERSION 3.20)
project(magfem_core CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(POLICY CMP0135)
  cmake_policy(SET CMP0135 NEW)
endif()
include(FetchContent)
FetchContent_Declare(eigen
  URL https://gitlab.com/libeigen/eigen/-/archive/3.4.0/eigen-3.4.0.tar.gz
  URL_HASH SHA256=8586084f71f9bde545ee7fa6d00288b264a2b7ac3607b974e54d13e7162c1c72)
FetchContent_GetProperties(eigen)
if(NOT eigen_POPULATED)
  FetchContent_Populate(eigen)   # só os headers; não roda o CMake do Eigen
endif()

add_library(magfem STATIC src/poisson1d.cpp)
target_include_directories(magfem PUBLIC src ${eigen_SOURCE_DIR})
target_compile_definitions(magfem PUBLIC EIGEN_MPL2_ONLY)

if(EMSCRIPTEN)
  add_executable(core bindings/wasm_api.cpp)
  target_link_libraries(core magfem)
  target_link_options(core PRIVATE
    -lembind
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createCore
    -sENVIRONMENT=worker,web
    -sALLOW_MEMORY_GROWTH=1)
else()
  enable_testing()
  add_executable(test_poisson1d tests/test_poisson1d.cpp)
  target_link_libraries(test_poisson1d magfem)
  add_test(NAME poisson1d COMMAND test_poisson1d)
endif()
