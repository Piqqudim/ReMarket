import ProductDetailsClient from "@/components/product/ProductDetailsClient";

type ProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  return <ProductDetailsClient productId={id} />;
}
